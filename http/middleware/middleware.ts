import type { NextFunction, Request, Response } from "express"
import * as jwt from "jsonwebtoken";

export const Middleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({
            "success": false,
            "error": "Unauthorized, token missing or invalid"
        })
    }

    try {
        const secret =
            process.env.JWT_SECRET ||
            process.env.JWT_SECRET_KEY ||
            "dev_jwt_secret_change_me";
        const { userId, role } = jwt.verify(token, secret) as jwt.JwtPayload;
        req.userId = userId;
        req.role = role;
        return next();
    } catch (e) {
        return res.status(401).json({
            "success": false,
            "error": "Unauthorized, token missing or invalid"
        })
    }
}