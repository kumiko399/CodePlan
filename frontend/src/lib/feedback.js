import { ElMessage, ElMessageBox } from "element-plus";
import { i18n } from "../i18n.js";
export function showError(error) {
  const key = `error_${error.message}`;
  ElMessage.error(
    i18n.global.te(key) ? i18n.global.t(key) : i18n.global.t("error_GENERIC"),
  );
}
export async function confirmAction(message) {
  try {
    await ElMessageBox.confirm(message, i18n.global.t("confirm"), {
      confirmButtonText: i18n.global.t("confirm"),
      cancelButtonText: i18n.global.t("cancel"),
      type: "warning",
    });
    return true;
  } catch {
    return false;
  }
}
