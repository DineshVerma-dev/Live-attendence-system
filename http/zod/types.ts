
import {z} from "zod";

export const SignupSchema = z.object({
  name: z.string().min(3).max(20),
  email: z.email(),
  password: z.string().min(5 , {"error" : "Too short"}),
  role : z.enum(["teacher" , "student"])
})

export const SigninSchema = z.object({
    email: z.email(),
    password: z.string(),
})

export const CreateClassSchema = z.object({
    className : z.string()
})

export const AddStudentSchema = z.object({
   StudentId : z.string()
})

export const AttendenceStartSchema  = z.object({
   classId : z.string()
})