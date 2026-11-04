# Outlined Settings gear

Generated with the built-in imagegen tool, using the user's screenshot 5 as the
style reference. Selected project asset: [settings-gear.png](../../src/assets/settings-gear.png).

The user selected the third generated image. The PNG is retained byte-for-byte
and used as a luminance mask so its black backdrop disappears and its original
outline inherits each button's text color. No stroke expansion or tracing changes
the approved shape. The native build embeds the PNG in its JavaScript bundle;
no remote asset or additional runtime permission is required. The web offline
shell also caches the image.

Asset SHA-256: `bc5302073cf8a30aabea15e81ed2b26aa956d400869cfea3345c0691135cc252`.

Final generation prompt:

> Create one clean monochrome settings icon: a perfectly symmetrical eight-tooth rounded cog outline and a small round center-hole outline. Draw it as a flat pure white (#FFFFFF) uniform monoline on a perfectly solid pure black (#000000) square background. The open space between the cog outline and the center circle must be pure black, and the center hole must be pure black too. Exactly two smooth closed white outlines: outer rounded cog boundary and inner circle. Stroke thickness about 1.7 on a 24-unit grid. Shape extends from x=2 to x=22 and y=2 to y=22 on a 24-unit square. Gently rounded tooth tips and rounded valleys, conventional macOS Settings toolbar gear proportions. Crisp flat vector-style rendering. NO texture, NO speckles, NO grain, NO extra marks, NO gradients, NO shadows, NO bevel, NO shading, NO transparency. Only clean white lines on plain black. No text, no frame.

The generated transparent variants had visible stray pixels and were rejected.
