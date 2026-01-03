
import { z } from "zod";

export const SignupSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["teacher", "student"])
});

export const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const CreateClassSchema = z.object({
  className: z.string()
});

export const AddStudentSchema = z.object({
  studentId: z.string()
});

export const AttendenceStartSchema = z.object({
  classId: z.string()
});