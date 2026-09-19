import { evaluateRegex, type RegexInput } from "../lib/regex.ts";

self.onmessage = (event: MessageEvent<RegexInput>) => {
  self.postMessage(evaluateRegex(event.data));
};
