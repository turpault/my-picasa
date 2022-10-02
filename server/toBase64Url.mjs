import { readFileSync, writeFileSync } from "fs";
import { extname } from "path";



const file = process.argv[2];
const target = file.replace(extname(file), ".html");

const buf = readFileSync(file);
writeFileSync(target, `
<!DOCTYPE html>
<html dir="ltr" lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0"
    />
  </head>
<body>
  <img style="left:0;right:0;top:0;bottom:0;width:100%;height:100%;position:fixed;" src="data:image/png;base64,${buf.toString('base64')}"/>
</body>
</html>
`);
