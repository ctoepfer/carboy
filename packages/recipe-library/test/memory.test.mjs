import { conformance } from "./conformance.mjs";
import { memoryStore } from "../dist/index.js";
import { failing } from "./helpers.mjs";

const makeStore = async () => memoryStore();
makeStore.faulty = async (op, after = 0) => failing(memoryStore(), op, after);
conformance("memory", makeStore);
