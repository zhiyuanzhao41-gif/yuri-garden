export function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export function handleJsonError(res, error) {
  res.status(error.status || 500).json({ error: error.message });
}
