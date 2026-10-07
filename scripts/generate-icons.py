from pathlib import Path
from PIL import Image, ImageDraw

# Raster export of public/mark.svg. Centered 4-unit strokes preserve the SVG geometry.
target = Path(__file__).resolve().parents[1] / 'public/icons'
target.mkdir(exist_ok=True)
for name, size in [('icon-192',192),('icon-512',512),('maskable-512',512),('apple-touch-icon',180)]:
    supersample = 4
    image = Image.new('RGB',(size*supersample,size*supersample),'#101114')
    draw = ImageDraw.Draw(image)
    factor = (.70 if name.startswith('maskable') else .84) * size*supersample/64
    center = size*supersample/2
    for radius in (26,16):
        outer = (radius+2)*factor
        draw.ellipse((center-outer,center-outer,center+outer,center+outer),outline='#818cf8',width=round(4*factor))
    radius = 6*factor
    draw.ellipse((center-radius,center-radius,center+radius,center+radius),fill='#818cf8')
    image.resize((size,size),Image.Resampling.LANCZOS).save(target/(name+'.png'))
