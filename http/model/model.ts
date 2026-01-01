import mongoose, { Types } from "mongoose";

interface IUser {
    name : String,
    email : String,
    password :  String,
    enum : []
}
const UserSchema = new mongoose.Schema<IUser>({
    name: String,
    email : { type : String , unique : true },
    password : String,
    enum : ["Student" , "Teacher"]
})

const ClassSchema = new mongoose.Schema({
    className : String,
    teacherId : {
        type: mongoose.Types.ObjectId,
        ref : "UserModel",
    },
    StudentId: [{
        type : mongoose.Types.ObjectId,
        ref : "UserModel",
    }]
})

const AttendanceSchema = new mongoose.Schema({
    classId  : {
        type : mongoose.Types.ObjectId,
        ref : "ClassModel",
    },
    studentId : {
        type : mongoose.Types.ObjectId,
        ref : "UserModel",
    },
    enum : ["present","absent"],
})

export const AttendanceModel = mongoose.model("AttendanceModel",AttendanceSchema);
export const ClassModel = mongoose.model("ClassModel",ClassSchema);
export const UserModel = mongoose.model("UserModel", UserSchema);