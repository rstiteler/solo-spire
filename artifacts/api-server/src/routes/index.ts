import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignsRouter from "./campaigns";
import charactersRouter from "./characters";
import chatRouter from "./chat";
import diceRouter from "./dice";
import questsRouter from "./quests";
import inventoryRouter from "./inventory";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignsRouter);
router.use(charactersRouter);
router.use(chatRouter);
router.use(diceRouter);
router.use(questsRouter);
router.use(inventoryRouter);
router.use(storageRouter);

export default router;
