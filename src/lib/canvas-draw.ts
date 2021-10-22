import { jBone as $ } from "../lib/jbone/jbone.js";

export function cancelRectangleDraw(canvas: HTMLCanvasElement) {}
export function drawRectangle(canvas: HTMLCanvasElement) {
  let unstroke: Function | undefined;
  // get references to the canvas and context
  var ctx = canvas.getContext("2d")!;

  // style the context
  ctx.strokeStyle = "blue";
  ctx.lineWidth = 3;

  // calculate where the canvas is on the window
  // (used to help calculate mouseX/mouseY)
  var $canvas = $(canvas);

  // this flage is true when the user is dragging the mouse
  var isDown = false;

  // these vars will hold the starting mouse position
  var startX: number;
  var startY: number;
  var zoom: number;

  function handleMouseDown(e: any) {
    e.preventDefault();
    e.stopPropagation();
    var offsetX = canvas.offsetLeft;
    var offsetY = canvas.offsetTop;
    var scrollX = canvas.scrollLeft;
    var scrollY = canvas.scrollTop;

    // save the starting x/y of the rectangle
    zoom = canvas.width / canvas.clientWidth;
    startX = zoom * (e.clientX - offsetX);
    startY = zoom * (e.clientY - offsetY);

    // set a flag indicating the drag has begun
    isDown = true;
  }

  function handleMouseUp(e: Event) {
    e.preventDefault();
    e.stopPropagation();

    // the drag is over, clear the dragging flag
    isDown = false;
    if (unstroke) {
      unstroke();
      unstroke = undefined;
    }
  }

  function handleMouseOut(e: Event) {
    e.preventDefault();
    e.stopPropagation();

    // the drag is over, clear the dragging flag
    isDown = false;
    if (unstroke) {
      unstroke();
      unstroke = undefined;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // if we're not dragging, just return
    if (!isDown) {
      return;
    }
    var offsetX = canvas.offsetLeft;
    var offsetY = canvas.offsetTop;
    var scrollX = canvas.scrollLeft;
    var scrollY = canvas.scrollTop;

    // get the current mouse position in canvas coordinates
    const mouseX = zoom * (e.clientX - offsetX);
    const mouseY = zoom * (e.clientY - offsetY);

    // calculate the rectangle width/height based
    // on starting vs current mouse position
    var width = mouseX - startX;
    var height = mouseY - startY;

    // draw a new rect from the start position
    // to the current mouse position
    if (unstroke) {
      unstroke();
    }
    let sX = Math.floor(startX),
      sY = Math.floor(startY),
      sW = Math.floor(width),
      sH = Math.floor(height);
    unstroke = () => {
      // set the composite property shape
      ctx.globalCompositeOperation = "xor";
      console.info(sX, sY, sW, sH);
      ctx.strokeRect(sX, sY, sW, sH);
    };
    unstroke();
  }

  // listen for mouse events
  $canvas.on("mousedown", function (e: MouseEvent) {
    handleMouseDown(e);
  });
  $canvas.on("mousemove", function (e: MouseEvent) {
    handleMouseMove(e);
  });
  $canvas.on("mouseup", function (e: MouseEvent) {
    handleMouseUp(e);
  });
  $canvas.on("mouseout", function (e: MouseEvent) {
    handleMouseOut(e);
  });
}
