import mongoose, { Types } from "mongoose";

interface IUser {
    name: string;
    email: string;
    password: string;
    role: "teacher" | "student";
}
const UserSchema = new mongoose.Schema<IUser>({
    name: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["teacher", "student"], required: true }
});

interface IClass {
    className: string;
    teacherId: Types.ObjectId;
    studentIds: Types.ObjectId[];
}
const ClassSchema = new mongoose.Schema<IClass>({
    className: { type: String, required: true },
    teacherId: {
        type: mongoose.Types.ObjectId,
        ref: "UserModel",
        required: true,
    },
    studentIds: [{
        type: mongoose.Types.ObjectId,
        ref: "UserModel",
        required: true,
    }]
});

interface IAttendance {
    status: "present" | "absent";
    classId: Types.ObjectId;
    studentId: Types.ObjectId;
}
const AttendanceSchema = new mongoose.Schema<IAttendance>({
    status: { type: String, enum: ["present", "absent"], required: true },
    classId: {
        type: mongoose.Types.ObjectId,
        ref: "ClassModel",
        required: true,
    },
    studentId: {
        type: mongoose.Types.ObjectId,
        ref: "UserModel",
        required: true,
    },
});

AttendanceSchema.index({ classId: 1, studentId: 1 }, { unique: true });

export const AttendanceModel = mongoose.model("AttendanceModel", AttendanceSchema);
export const ClassModel = mongoose.model("ClassModel", ClassSchema);
export const UserModel = mongoose.model("UserModel", UserSchema);