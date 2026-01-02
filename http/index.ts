import express from "express";
import { SigninSchema, SignupSchema, CreateClassSchema, AddStudentSchema } from "./zod/types";
import { AttendanceModel, ClassModel, UserModel } from "./model/model";
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
        return res.status(400).json({
            "success": false,
            "error": "Invalid request schema",
        })
    }


    const classdb = await ClassModel.create({
        className: data.className,
        teacherId: new Types.ObjectId(req.userId as string),
        StudentId: []
    })

    return res.json({
        "success": true,
        "data": {
            "_id" : classdb._id,
            "className" : classdb.className,
            "teacherId" : classdb.teacherId,
        }
    })
})

app.post("/class/:id/add-student" , Middleware , TeacherMiddleware , async (req,res) => {
   const { success ,data} = AddStudentSchema.safeParse(req.body) ;
    if(!success){
        return res.status(400).json({
             "success" : false,
             "error" : "Invalid request schema"
        });
    }

    const studentId = data.StudentId;
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({
            "success": false,
            "error": "Invalid StudentId",
        });
    }

    const classdb = await ClassModel.findOne({
        _id : req.params.id,
    })
    if(!classdb) {
       return res.status(400).json({
            "success" : false,
            "error" : "class not found"
        })
    }

    const userdb = await UserModel.findOne({
         _id : studentId,
    })
    if(!userdb){
        return res.status(400).json({
            "success" : false,
            "error" : "Student not found",
        })
    }

    classdb.StudentId.push(new Types.ObjectId(studentId));
    await classdb.save();
    return res.json({
        "success" : true,
        "data" : {
            "_id" : classdb._id,
            "className" : classdb.className,
            teacherId : classdb.teacherId,
            "studentId" : classdb.StudentId,
        }
    })
})

app.get("/class/:id" ,Middleware  , async (req,res) => {
    const classdb = await ClassModel.findOne({
    _id : req.params.id
    }) 
    if(!classdb) {
     return res.status(400).json({
       "success"  :false,
       "error" : "Class doesnt exists",
    })
    }

    if (!req.userId || !Types.ObjectId.isValid(req.userId as string)) {
        return res.status(401).json({
            "success": false,
            "error": "Unauthorized",
        })
    }

    const userObjectId = new Types.ObjectId(req.userId as string);

    const isTeacher = classdb.teacherId.equals(userObjectId);
    const isStudent = classdb.StudentId.some((id) => id.equals(userObjectId));

    if (!isTeacher && !isStudent) {
        return res.status(403).json({
            "success" : false,
            "error" : "Forbidden"
        })
    }

    return res.json({
        "success": true,
        "data": {
            "_id": classdb._id,
            "className": classdb.className,
            "teacherId": classdb.teacherId,
            "studentId": classdb.StudentId,
        }
    })
})

app.get("/students", Middleware, TeacherMiddleware ,async(req,res) => {
   const users = UserModel.find({
    role : "student",
   })
   res.json({
    "success" : true,
    "data" : (await users).map(u => ({
        _id : u._id,
        name : u.name,
        email:u.email
    }))
   })
})

app.get("/class/:id/my-attendance",Middleware , async (require,res)=>{
    const classId = require.params.id;
    const userId = require.userId;
    const attendance = await AttendanceModel.findOne({
        classId,
        studentId : userId,
    })

    if(attendance){
        res.json({
            "success" : true,
            "data" : {
                "classId" : classId,
                "status" : "present" 
            }
        }) 
    } else  {
        res.json({
            "success" : true,
            "data" : {
                "classId" : classId,
                "status" : null
            }
        })
    }
})

app.post("/attendence/start",Middleware , TeacherMiddleware)
app.listen(PORT, () => {
    console.log(`the app is running at the ${PORT}`)
})