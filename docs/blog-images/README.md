# Blog images

Source files for blog cover and social images. Nothing here is served by the site: the finished image is uploaded to the public `blog-media` Storage bucket (the blog editor's Upload button does this) and the post points at that URL.

Each post gets a folder named after its slug with `cover.html` (the design), `cover.png` (2x render) and `cover.jpg` (what was uploaded).

## Render a cover (1200 x 630, rendered at 2x)

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --allow-file-access-from-files --window-size=1200,630 --force-device-scale-factor=2 --virtual-time-budget=9000 --screenshot="$PWD/docs/blog-images/<slug>/cover.png" "file://$PWD/docs/blog-images/<slug>/cover.html"
```

Then make the web copy (about a tenth of the size, no visible difference):

```bash
node -e 'require("sharp")("docs/blog-images/<slug>/cover.png").jpeg({quality:88,mozjpeg:true,chromaSubsampling:"4:4:4"}).toFile("docs/blog-images/<slug>/cover.jpg")'
```

## Rules

- Keep the key text inside the central 980 px: the blog list cards crop the sides.
- Same rules as the site copy: no em or en dashes, only verified facts, no photos of real people, no official-looking government marks, no other companies' logos.
