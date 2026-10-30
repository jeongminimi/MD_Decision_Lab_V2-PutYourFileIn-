import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AccountProvider } from "./Account";
import "./styles.css";
import "./editorial.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AccountProvider><App /></AccountProvider>
  </React.StrictMode>,
);
