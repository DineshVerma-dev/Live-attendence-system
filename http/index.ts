import express from "express";
import mongoose, { Types } from "mongoose";
import * as jwt from "jsonwebtoken";
import * as bcrypt from "bcryptjs";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

import {
    AddStudentSchema,
    AttendenceStartSchema,
    CreateClassSchema,
    SigninSchema,
    SignupSchema,
} from "./zod/types";
import { AttendanceModel, ClassModel, UserModel } from "./model/model";
import { Middleware } from "./middleware/middleware";
import { TeacherMiddleware } from "./middleware/TeacherMiddleware";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET =
    process.env.JWT_SECRET ||
    process.env.JWT_SECRET_KEY ||
    "dev_jwt_secret_change_me";
const MONGO_URL = process.env.MONGO_URL;

type AttendanceStatus = "present" | "absent";
type ActiveSession = {
    classId: string;
    startedAt: string; // ISO string
    attendance: Record<string, AttendanceStatus>;
};

let activeSession: ActiveSession | null = null;

const sendSuccess = (res: express.Response, status: number, data: unknown) => {
    return res.status(status).json({ success: true, data });
};

const sendError = (res: express.Response, status: number, error: string) => {
    return res.status(status).json({ success: false, error });
};

const isObjectId = (value: unknown): value is string =>
    typeof value === "string" && Types.ObjectId.isValid(value);

// --- Auth ---

app.post("/auth/signup", async (req, res) => {
    const parsed = SignupSchema.safeParse(req.body);
    if (!parsed.success) {
        return sendError(res, 400, "Invalid request schema");
    }

    const data = parsed.data;

    const existing = await UserModel.findOne({ email: data.email });
    if (existing) {
        return sendError(res, 400, "Email already exists");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    try {
        const user = await UserModel.create({
            name: data.name,
            email: data.email,
            password: passwordHash,
            role: data.role,
        });

        return sendSuccess(res, 201, {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
        });
    } catch (err: any) {
        if (err?.code === 11000) {
            return sendError(res, 400, "Email already exists");
        }
        return sendError(res, 500, "Internal server error");
    }
});

app.post("/auth/login", async (req, res) => {
    const parsed = SigninSchema.safeParse(req.body);
    if (!parsed.success) {
        return sendError(res, 400, "Invalid request schema");
    }

    const data = parsed.data;
    const user = await UserModel.findOne({ email: data.email });
    if (!user) {
        return sendError(res, 400, "Invalid email or password");
    }

    const ok = await bcrypt.compare(data.password, user.password);
    if (!ok) {
        return sendError(res, 400, "Invalid email or password");
    }

    const token = jwt.sign(
        {
            userId: user._id.toString(),
            role: user.role,
        },
        JWT_SECRET,
        { expiresIn: "1h" }
    );

    return sendSuccess(res, 200, { token });
});

app.get("/auth/me", Middleware, async (req, res) => {
    if (!req.userId) {
        return sendError(res, 401, "Unauthorized, token missing or invalid");
    }

    const user = await UserModel.findById(req.userId).select("name email role");
    if (!user) {
        return sendError(res, 401, "Unauthorized, token missing or invalid");
    }

    return sendSuccess(res, 200, {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
    });
});

// --- Class ---

app.post("/class", Middleware, TeacherMiddleware, async (req, res) => {
    const parsed = CreateClassSchema.safeParse(req.body);
    if (!parsed.success) {
        return sendError(res, 400, "Invalid request schema");
    }
    if (!req.userId || !isObjectId(req.userId)) {
        return sendError(res, 401, "Unauthorized, token missing or invalid");
    }

    const classDoc = await ClassModel.create({
        className: parsed.data.className,
        teacherId: new Types.ObjectId(req.userId),
        studentIds: [],
    });

    return sendSuccess(res, 201, {
        _id: classDoc._id,
        className: classDoc.className,
        teacherId: classDoc.teacherId,
        studentIds: classDoc.studentIds,
    });
});

app.post(
    "/class/:id/add-student",
    Middleware,
    TeacherMiddleware,
    async (req, res) => {
        const parsed = AddStudentSchema.safeParse(req.body);
        if (!parsed.success) {
            return sendError(res, 400, "Invalid request schema");
        }

        if (!req.userId || !isObjectId(req.userId)) {
            return sendError(res, 401, "Unauthorized, token missing or invalid");
        }

        const classId = req.params.id;
        if (!isObjectId(classId)) {
            return sendError(res, 400, "Invalid request schema");
        }

        const studentId = parsed.data.studentId;
        if (!isObjectId(studentId)) {
            return sendError(res, 400, "Invalid request schema");
        }

        const classDoc = await ClassModel.findById(classId);
        if (!classDoc) {
            return sendError(res, 404, "Class not found");
        }

        if (!classDoc.teacherId.equals(new Types.ObjectId(req.userId))) {
            return sendError(res, 403, "Forbidden, not class teacher");
        }

        const student = await UserModel.findById(studentId);
        if (!student) {
            return sendError(res, 404, "Student not found");
        }
        if (student.role !== "student") {
            return sendError(res, 404, "Student not found");
        }

        const studentObjId = new Types.ObjectId(studentId);
        const already = classDoc.studentIds.some((id) => id.equals(studentObjId));
        if (!already) {
            classDoc.studentIds.push(studentObjId);
            await classDoc.save();
        }

        return sendSuccess(res, 200, {
            _id: classDoc._id,
            className: classDoc.className,
            teacherId: classDoc.teacherId,
            studentIds: classDoc.studentIds,
        });
    }
);

app.get("/class/:id", Middleware, async (req, res) => {
    if (!req.userId || !isObjectId(req.userId)) {
        return sendError(res, 401, "Unauthorized, token missing or invalid");
    }
    const classId = req.params.id;
    if (!isObjectId(classId)) {
        return sendError(res, 400, "Invalid request schema");
    }

    const classDoc = await ClassModel.findById(classId).populate({
        path: "studentIds",
        select: "name email",
    });

    if (!classDoc) {
        return sendError(res, 404, "Class not found");
    }

    const userObjId = new Types.ObjectId(req.userId);
    const isTeacher = classDoc.teacherId.equals(userObjId);
    const isStudent = classDoc.studentIds.some((id: any) => id._id?.equals?.(userObjId) || id.equals?.(userObjId));

    if (!isTeacher && !isStudent) {
        return sendError(res, 403, "Forbidden, not class teacher");
    }

    const students = (classDoc.studentIds as any[]).map((s) => ({
        _id: s._id,
        name: s.name,
        email: s.email,
    }));

    return sendSuccess(res, 200, {
        _id: classDoc._id,
        className: classDoc.className,
        teacherId: classDoc.teacherId,
        students,
    });
});

app.get("/students", Middleware, TeacherMiddleware, async (_req, res) => {
    const users = await UserModel.find({ role: "student" }).select("name email");
    return sendSuccess(
        res,
        200,
        users.map((u) => ({ _id: u._id, name: u.name, email: u.email }))
    );
});

app.get("/class/:id/my-attendance", Middleware, async (req, res) => {
    if (!req.userId || !isObjectId(req.userId)) {
        return sendError(res, 401, "Unauthorized, token missing or invalid");
    }
    if (req.role !== "student") {
        return sendError(res, 403, "Forbidden");
    }

    const classId = req.params.id;
    if (!isObjectId(classId)) {
        return sendError(res, 400, "Invalid request schema");
    }

    const classDoc = await ClassModel.findById(classId);
    if (!classDoc) {
        return sendError(res, 404, "Class not found");
    }

    const studentObjId = new Types.ObjectId(req.userId);
    const enrolled = classDoc.studentIds.some((id) => id.equals(studentObjId));
    if (!enrolled) {
        return sendError(res, 403, "Forbidden");
    }

    const attendance = await AttendanceModel.findOne({
        classId: new Types.ObjectId(classId),
        studentId: studentObjId,
    });

    return sendSuccess(res, 200, {
        classId,
        status: attendance ? attendance.status : null,
    });
});

// --- Attendance session start (HTTP) ---

app.post("/attendance/start", Middleware, TeacherMiddleware, async (req, res) => {
    const parsed = AttendenceStartSchema.safeParse(req.body);
    if (!parsed.success) {
        return sendError(res, 400, "Invalid request schema");
    }

    if (!req.userId || !isObjectId(req.userId)) {
        return sendError(res, 401, "Unauthorized, token missing or invalid");
    }

    const classId = parsed.data.classId;
    if (!isObjectId(classId)) {
        return sendError(res, 400, "Invalid request schema");
    }

    const classDoc = await ClassModel.findById(classId);
    if (!classDoc) {
        return sendError(res, 404, "Class not found");
    }

    if (!classDoc.teacherId.equals(new Types.ObjectId(req.userId))) {
        return sendError(res, 403, "Forbidden, not class teacher");
    }

    activeSession = {
        classId,
        startedAt: new Date().toISOString(),
        attendance: {},
    };

    return sendSuccess(res, 200, {
        classId,
        startedAt: activeSession.startedAt,
    });
});

// --- WebSocket ---

type AuthedWs = WebSocket & { user?: { userId: string; role: "teacher" | "student" } };

const wsSend = (ws: WebSocket, event: string, data: any) => {
    ws.send(JSON.stringify({ event, data }));
};

const wsError = (ws: WebSocket, message: string) => {
    wsSend(ws, "ERROR", { message });
};

const broadcast = (wss: WebSocketServer, event: string, data: any) => {
    const payload = JSON.stringify({ event, data });
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    }
};

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (wsRaw, req) => {
    const ws = wsRaw as AuthedWs;

    const url = new URL(req.url || "/ws", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
        wsError(ws, "Unauthorized or invalid token");
        ws.close();
        return;
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
        if (!decoded?.userId || !decoded?.role) {
            wsError(ws, "Unauthorized or invalid token");
            ws.close();
            return;
        }

        ws.user = { userId: String(decoded.userId), role: decoded.role };
    } catch {
        wsError(ws, "Unauthorized or invalid token");
        ws.close();
        return;
    }

    ws.on("message", async (raw) => {
        let msg: any;
        try {
            msg = JSON.parse(String(raw));
        } catch {
            wsError(ws, "Invalid message format");
            return;
        }

        const event = msg?.event;
        const data = msg?.data || {};

        if (typeof event !== "string") {
            wsError(ws, "Invalid message format");
            return;
        }

        // --- Teacher events ---
        if (event === "ATTENDANCE_MARKED") {
            if (ws.user?.role !== "teacher") {
                wsError(ws, "Forbidden, teacher event only");
                return;
            }
            if (!activeSession) {
                wsError(ws, "No active attendance session");
                return;
            }

            const studentId = data?.studentId;
            const status = data?.status;
            if (!isObjectId(studentId) || (status !== "present" && status !== "absent")) {
                wsError(ws, "Invalid message format");
                return;
            }

            activeSession.attendance[studentId] = status;
            broadcast(wss, "ATTENDANCE_MARKED", { studentId, status });
            return;
        }

        if (event === "TODAY_SUMMARY") {
            if (ws.user?.role !== "teacher") {
                wsError(ws, "Forbidden, teacher event only");
                return;
            }
            if (!activeSession) {
                wsError(ws, "No active attendance session");
                return;
            }

            const values = Object.values(activeSession.attendance);
            const present = values.filter((v) => v === "present").length;
            const absent = values.filter((v) => v === "absent").length;
            const total = present + absent;

            broadcast(wss, "TODAY_SUMMARY", { present, absent, total });
            return;
        }

        if (event === "DONE") {
            if (ws.user?.role !== "teacher") {
                wsError(ws, "Forbidden, teacher event only");
                return;
            }
            if (!activeSession) {
                wsError(ws, "No active attendance session");
                return;
            }

            const classDoc = await ClassModel.findById(activeSession.classId);
            if (!classDoc) {
                wsError(ws, "Class not found");
                return;
            }

            if (!classDoc.teacherId.equals(new Types.ObjectId(ws.user.userId))) {
                wsError(ws, "Forbidden, not class teacher");
                return;
            }

            // Mark absent for all students not explicitly marked
            for (const sid of classDoc.studentIds) {
                const idStr = sid.toString();
                if (!activeSession.attendance[idStr]) {
                    activeSession.attendance[idStr] = "absent";
                }
            }

            const ops = Object.entries(activeSession.attendance).map(([studentId, status]) => ({
                updateOne: {
                    filter: {
                        classId: new Types.ObjectId(activeSession!.classId),
                        studentId: new Types.ObjectId(studentId),
                    },
                    update: { $set: { status } },
                    upsert: true,
                },
            }));

            if (ops.length > 0) {
                await AttendanceModel.bulkWrite(ops);
            }

            const values = Object.values(activeSession.attendance);
            const present = values.filter((v) => v === "present").length;
            const absent = values.filter((v) => v === "absent").length;
            const total = present + absent;

            activeSession = null;

            broadcast(wss, "DONE", {
                message: "Attendance persisted",
                present,
                absent,
                total,
            });
            return;
        }

        // --- Student events ---
        if (event === "MY_ATTENDANCE") {
            if (ws.user?.role !== "student") {
                wsError(ws, "Forbidden, student event only");
                return;
            }
            if (!activeSession) {
                wsError(ws, "No active attendance session");
                return;
            }

            const status = activeSession.attendance[ws.user.userId];
            wsSend(ws, "MY_ATTENDANCE", {
                status: status ? status : "not yet updated",
            });
            return;
        }

        wsError(ws, "Unknown event");
    });
});

const start = async () => {
    if (!MONGO_URL) {
        throw new Error("MONGO_URL is missing in environment");
    }

    await mongoose.connect(MONGO_URL);
    server.listen(PORT, () => {
        console.log(`HTTP+WS server running on ${PORT}`);
    });
};

start().catch((e) => {
    console.error(e);
    process.exit(1);
});