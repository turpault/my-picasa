// curl -X POST -H 'Content-type: application/json' --data '{"text":"Hello, World!"}' https://hooks.slack.com/services/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

const channels = {
  general: "T4D6Y481Z/B07PZPDERH7/UGy92D5RTDS5u64kdi3URNk6",
  bugs: "T4D6Y481Z/B07PPHGUA2G/dKsp7zjS8Y7NLDHV8TSFkfCg",
};
export function sendSlackMessage(
  message: string,
  channel: keyof typeof channels,
) {
  return fetch(`https://hooks.slack.com/services/${channels[channel]}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: message,
    }),
  });
}
