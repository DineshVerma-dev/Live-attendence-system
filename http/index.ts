import express from "express";
import { SigninSchema, SignupSchema, CreateClassSchema } from "./zod/types";
import { ClassModel, UserModel } from "./model/model";
import * as jwt from "jsonwebtoken";
import { Middleware } from "./middleware/middleware";
import { TeacherMiddleware } from "./middleware/TeacherMiddleware";
import { Types } from "mongoose";

const app = express();
app.use(express.json());
const PORT = 5000;

const JWT_SECRET = process.env.JWT_SECRET || "dev_jwt_secret_change_me";

app.post("/auth/signup", async (req, res) => {
    const { success, data } = SignupSchema.safeParse(req.body);
    if (!success) {
        return res.sendStatus(400).json({
            "success": false,
            "error": "Invalid request schema",
        })
    }

    const user = await UserModel.findOne({
        email: data.email
    })

    if (user) {
        return res.sendStatus(400).json({
            "success": false,
            "error": "Email already exists"
        })
    }

    const userdb = await UserModel.create({
        name: data.name,
        email: data.email,
        password: data.password,
    })

    res.json({
        success: true,
        data: {
            _id: userdb._id,
            name: userdb.name,
            email: data.email,
            password: data.password
        }
    })

})

app.post("/auth/login", async (req, res) => {
    const { success, data } = SigninSchema.safeParse(req.body);
    if (!success) {
        return res.sendStatus(400).json({
            "success": false,
            "error": "Invalid request schema",
        })
    }

    const userdb = await UserModel.findOne({
        email: data.email,
    })
    if (!userdb || userdb.password != data.password) {
        return res.sendStatus(400).json({
            "success": false,
            "error": "Invalid email or password"
        })
    }

    const token = jwt.sign(
        {
            role: userdb.role,
            userId: userdb._id,
        },
        JWT_SECRET,
        {
            expiresIn: "1h",
        }
    );

    return res.json({
        success: true,
        token,
    });
})

app.post("/auth/me", Middleware, async (req, res) => {
    const userdb = await UserModel.findById({
        _id: req.userId
    })
    if (!userdb) {
        res.sendStatus(401).json({
            "message": "contol shouldnt reach in /auth/me route"
        })
    }
    return res.json({
        "success": true,
        "data": {
            _id: userdb?._id,
            name: userdb?.name,
            email: userdb?.email,
            role: userdb?.role,
        }
    })
})

app.post("/class", Middleware, TeacherMiddleware, async (req, res) => {
    const { success, data } = CreateClassSchema.safeParse(req.body);
    if (!success) {
        return res.sendStatus(400).json({
            "success": false,
            "error": "Invalid request schema",
        })
    }

    if (!req.userId) {
        return res.sendStatus(401);
    }

    const classdb = await ClassModel.create({
        className: data.className,
        teacherId: new Types.ObjectId(req.userId as string),
        StudentId: []
    })

    return res.json({
        success: true,
        data: classdb
    })
})
app.listen(PORT, () => {
    console.log(`the app is running at the ${PORT}`)
})