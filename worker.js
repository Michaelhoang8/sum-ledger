import { analyze } from "./core.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, result: analyze(data.text, data.order) });
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
