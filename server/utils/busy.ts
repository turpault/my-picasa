let lastActivity: number = 0;

export function isIdle() {
  return new Date().getTime() - lastActivity > 10000;
}

export function busy() {
  lastActivity = new Date().getTime();
}
