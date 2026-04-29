import { format } from "date-fns";

export const logger = {
  info: (message: string) =>
    console.log(
      `[INFO] ${format(new Date(), "yyyy-MM-dd HH:mm:ss")} - ${message}`,
    ),
  warn: (message: string) =>
    `[WARN] ${format(new Date(), "yyyy-MM-dd HH:mm:ss")} - ${message}`,
  error: (message: string) =>
    console.error(
      `[ERROR] ${format(new Date(), "yyyy-MM-dd HH:mm:ss")} - ${message}`,
    ),
};
