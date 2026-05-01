import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    return void res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};
