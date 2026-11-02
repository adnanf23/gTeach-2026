import { describeError } from "@/lib/app-error";
import * as systemLogRepository from "@/repositories/systemLog.repository";

export async function writeLog({
  type = "info",
  msg,
  endpoint = "",
  statusCode = 200,
  payload = null,
}) {
  try {
    const currentUserId = await systemLogRepository.currentUserId();

    const logData = {
      type,
      aktivitas: msg || "Aktivitas tanpa deskripsi",
      endpoint: endpoint || "-",
      status_code: Number(statusCode) || 200,
      payload_json: payload || {},
      msg: msg || "Aktivitas tanpa deskripsi",
    };

    if (currentUserId) {
      logData.user_id = currentUserId;
    }

    await systemLogRepository.insertLog(logData);
    return { error: null };
  } catch (error) {
    return { error: describeError(error) };
  }
}
