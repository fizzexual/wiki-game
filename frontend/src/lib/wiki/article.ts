// Fetch a Wikipedia article's rendered HTML and rewrite it so it can live
// inside our iframe with no server. This replaces Flask's /play/article proxy:
//   * internal links become inert (#) and carry the target title in a data
//     attribute; an injected script reports clicks to the parent via postMessage
//   * external links open in a new tab
//   * the page's own scripts are stripped; Wikipedia's stylesheet + our tweaks
//     are injected so the article still looks right

const REST_HTML = "https://en.wikipedia.org/api/rest_v1/page/html/";

const LINK_RE = /href="\.\/([^"#]*)(#[^"]*)?"/g;
const BASE_RE = /<base\b[^>]*\/?>/gi;
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

// Light styling for the proxied article (ported from static/article.css).
const ARTICLE_CSS = `
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0 auto;padding:20px 32px 40px;max-width:920px;color:#202122;background:#fff;line-height:1.55;}
a{color:#3366cc;cursor:pointer;}
a:visited{color:#6b4ba1;}
a[target="_blank"]{color:#999;}
h1,h2,h3{font-family:"Linux Libertine",Georgia,serif;}
img{max-width:100%;height:auto;}
.mw-editsection,.reference,.noprint{display:none !important;}
table{max-width:100%;}
.infobox{float:right;margin:0 0 16px 16px;max-width:320px;}
`;

// Injected into every article. Intercepts in-article link clicks and forwards
// the target title to the parent window, which counts the click and loads the
// next article. Keeps navigation inside the game.
const INTERCEPTOR = `
<script>
(function(){
  document.addEventListener("click", function(e){
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if(!a) return;
    var seg = a.getAttribute("data-wiki-target");
    if(seg !== null){
      e.preventDefault();
      var title;
      try { title = decodeURIComponent(seg).replace(/_/g," "); }
      catch(err){ title = seg.replace(/_/g," "); }
      parent.postMessage({ source:"wikigame", type:"navigate", title:title }, "*");
      return;
    }
    if(a.getAttribute("target") === "_blank") return; // external — new tab
    var href = a.getAttribute("href") || "";
    if(href.charAt(0) === "#") return;                // in-page anchor
    e.preventDefault();                               // block stray navigation
  }, true);
})();
<\/script>`;

function injectHead(html: string): string {
  const inject =
    '<meta charset="utf-8">' +
    '<link rel="stylesheet" href="https://en.wikipedia.org/w/load.php?' +
    "modules=site.styles%7Cext.cite.styles%7Cmediawiki.skinning.content.parsoid" +
    '&only=styles&skin=vector">' +
    `<style>${ARTICLE_CSS}</style>` +
    INTERCEPTOR;
  if (html.includes("</head>")) return html.replace("</head>", inject + "</head>");
  return inject + html;
}

/** Build a standalone HTML document for `title`, ready to drop into an
 *  iframe's srcdoc. Throws if the article doesn't exist. */
export async function fetchArticleHtml(title: string): Promise<string> {
  const url = REST_HTML + encodeURIComponent(title.replace(/ /g, "_"));
  const r = await fetch(url);
  if (r.status === 404) throw new Error(`Article not found: ${title}`);
  if (!r.ok) throw new Error(`Wikipedia REST ${r.status}`);
  let html = await r.text();

  html = html.replace(BASE_RE, "");
  html = html.replace(LINK_RE, (_m, seg) => `href="#" data-wiki-target="${seg}"`);
  html = html.replace(/rel="mw:ExtLink"/g, 'rel="mw:ExtLink noopener" target="_blank"');
  html = html.replace(SCRIPT_RE, "");
  html = injectHead(html);
  return html;
}

/** A minimal error document, used when an article fails to load. */
export function errorDoc(message: string): string {
  return (
    "<!doctype html><meta charset='utf-8'>" +
    `<style>${ARTICLE_CSS}</style>` +
    `<body><p style="color:#a33;padding:24px">${message}</p></body>`
  );
}
