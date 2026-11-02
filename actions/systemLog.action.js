"use server";

import * as systemLogService from "@/services/systemLog.service";

export async function createSystemLogAction(params) {
  return systemLogService.writeLog(params);
}
