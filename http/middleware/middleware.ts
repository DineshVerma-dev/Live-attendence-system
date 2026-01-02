import type { NextFunction, Request, Response } from "express"
import * as jwt from "jsonwebtoken";

export const Middleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;
    if(!token){
        return res.status(401).json({
           "success": false,
           "error": "Unauthorized, token missing or invalid"
        })
    }
    
    try {
       const {userId,role} =   jwt.verify(token, process.env.JWT_SECRET_KEY as string) as jwt.JwtPayload;
       req.userId = userId,
       req.role = role
       next();
    } catch (e) {
         return res.status(401).json({
           "success": false,
           "error": "Unauthorized, token missing or invalid"
        })
    }
    next();
}