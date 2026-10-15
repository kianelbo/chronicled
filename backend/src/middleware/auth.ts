import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
  userId?: number;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    const userId = Number(decoded.userId);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.userId = userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: err });
  }
};
