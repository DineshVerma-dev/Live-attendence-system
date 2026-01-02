import type { Request, Response, NextFunction } from "express";

export const TeacherMiddleware  = (req : Request , res : Response , next : NextFunction) => {
      if(!req.role || req.role != "teacher"){
          return res.sendStatus(403).json({
          "success": false,
          "error": "Forbidden, teacher access required"
        })
      }
}