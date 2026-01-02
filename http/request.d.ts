declare namespace Express{
    export interface Request{
        userId? : String,
        role? : "teacher" | "student"
    }
}