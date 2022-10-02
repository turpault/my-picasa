import { getService } from "../rpc/connect";

export async function consoleOverload() {
  const s = await getService();
  const mc = console as any;
  const fcts = Object.keys(mc).filter(k => typeof mc[k] === 'function');

  for(const fct of fcts) {
      const oldFct = mc[fct];
      (console as any)[fct] = function(...args:any[])  {
          oldFct.apply(args);
          s.log(fct, args);
      }
  }
  if(window) {
      window.onerror = function (message, file, line, col, error) {
        s.exception(message as string, file!, line!, col!, error!);
          return false;
       };
       window.addEventListener("error", function (e) {
        s.exception(e.message, e.filename, e.lineno, e.colno, e.error);
          return false;
       })
  }
}
