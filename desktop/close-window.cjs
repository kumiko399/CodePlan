// Window close follows the saved desktop preference; managed quit keeps edit guards.
function createCloseHandler({
  getWindow,
  isQuitting,
  canHideToTray,
  getCloseAction,
  quit,
  onError,
}) {
  let handling = false;
  return async function onClose(event) {
    if (isQuitting()) return;
    event.preventDefault();
    if (handling) return;
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    handling = true;
    try {
      if (getCloseAction() === "exit") await quit();
      else if (canHideToTray()) window.hide();
      else window.minimize();
    } catch (error) {
      if (!isQuitting() && !window.isDestroyed()) onError(error);
    } finally {
      handling = false;
    }
  };
}
module.exports = { createCloseHandler };
