import { vi } from "vitest";
import { hostApi } from "./host";

vi.mock("@freelensapp/extensions", () => hostApi);