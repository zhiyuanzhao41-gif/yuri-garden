export function formatTime(date) {
  return date
    .toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replaceAll("/", "-");
}

export function formatHistoryTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : formatTime(date);
}
