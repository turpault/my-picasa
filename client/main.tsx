import { createRoot } from "react-dom/client";
import { initClientSentry } from "./components/sentry";
import { consoleOverload } from "./components/error-utils";
import { setServicePort } from "./rpc/connect";
import { App } from "./App.tsx";

const searchParams = new URLSearchParams(location.search);
const port = parseInt(searchParams.get("port") || location.port || "5500");

initClientSentry();
setServicePort(port);
consoleOverload();

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
