import { env } from "@/lib/env";

// Loader for the script-tag snippet (brief §5.3). It turns every
// <div data-testimonial-widget="{publicKey}/{widgetId}"> into a lazy iframe and resizes it to fit.
// The iframe keeps the widget's styles and scripts isolated from the host page (plain HTML, WordPress, …).
const loader = (origin: string) => `(function(){
  var ORIGIN=${JSON.stringify(origin)};
  var RE=/^[0-9a-f]{32}[/][0-9a-f-]{36}$/;
  var frames={};
  function mount(el){
    if(el.getAttribute("data-tc-mounted"))return;
    var id=el.getAttribute("data-testimonial-widget")||"";
    if(!RE.test(id))return;
    el.setAttribute("data-tc-mounted","1");
    var f=document.createElement("iframe");
    f.src=ORIGIN+"/embed/"+id;
    f.title=el.getAttribute("data-title")||"Testimonials";
    f.loading="lazy";
    f.setAttribute("allow","fullscreen");
    var h=parseInt(el.style.minHeight,10)||320;
    f.style.cssText="display:block;width:100%;border:0;height:"+h+"px;color-scheme:normal";
    el.appendChild(f);
    (frames[id]=frames[id]||[]).push(f);
  }
  window.addEventListener("message",function(e){
    if(e.origin!==ORIGIN||!e.data||e.data.type!=="tc-widget:height")return;
    var list=frames[e.data.id]||[];
    for(var i=0;i<list.length;i++){
      if(list[i].contentWindow===e.source){
        var h=Math.max(40,Math.min(5000,Number(e.data.height)||0));
        list[i].style.height=h+"px";
        if(list[i].parentNode)list[i].parentNode.style.minHeight="0";
      }
    }
  });
  function scan(){var els=document.querySelectorAll("[data-testimonial-widget]");for(var i=0;i<els.length;i++)mount(els[i]);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();
})();`;

export function GET() {
  return new Response(loader(env.appUrl), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
