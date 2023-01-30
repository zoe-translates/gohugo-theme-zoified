# Zoified is a Hugo theme based on Ed

This is a clone of the Hugo theme
[Ed](https://github.com/sergeyklay/gohugo-theme-ed) by Serhei Iakovlev. It has
been adapted for my personal website because my site's structure and needs are
different from the original intended user case.

My website contains three major sections (translations, original works, and
blog posts). The "genres" or literary types (poetry, narrative, etc.) are
orthogonal to the sections. For example, "poetry" may appear under
"translations" or "original works". To better implement and manage the section
structure and genres, I need some changes to the template themselves.

Other major changes include the following:

- The table of contents has been redesigned for the user case of showing a long
  table. Each item's section is shown in the table, and visual cues are put in
  place to guide the viewing of a long table.
- The list of tags under the blog post is further simplified. Instead of drawn
  boundaries imitating a physical tag, I prefer a simple comma-separated list
  as a text line.
- A new kind of byline item, the "translator", has been implemented and added
  to the byline when necessary.
- The search index now includes the "author" field to make search by author
  easier.
- The search page includes more help context.
- Overall, the document structure and styles are being redesigned for further
  simplicity, readability, and accessibility (WIP).

The following text is from the original Ed project's README page.

---

Ed is a [Hugo](http://gohugo.io) theme designed for textual editors based on
[minimal computing](http://go-dh.github.io/mincomp/) principles, and focused
on legibility, durability, ease and flexibility.

---

This theme is adopted and finalized with new functionality from
[Jekyll](https://jekyllrb.com) [Ed](https://github.com/minicomp/ed)
theme by [Alex Gil](https://twitter.com/elotroalex).

## Sample Ed editions

- [Our sample site](https://gohugo-theme-ed.netlify.app/?utm_source=github.com&utm_campaign=docs&utm_medium=smm) is the first edition built with Ed.
- [Serghei Iakovlev's blog](https://serghei.blog/?utm_source=github.com&utm_campaign=docs&utm_medium=smm)

## Features

- Templates for narrative, drama and poetry
- Responsive design for mobile phones, tablets and PCs
- Relatively easy to learn and teach
- Works well in high- or low- bandwidth scenarios
- Easier for digital archives and libraries to preserve
- Open source, open access
- Unobtrusive footnotes
- Metadata in OpenGraph to play nice with social media and search engines
- Automatic table of content generation
- Simple search functionality
- Annotations via [hypothes.is](https://hypothes.is/)
- Contact form
- Custom `robots.txt` (changes values based on environment)
- RSS/Atom/Json Feeds Discovery

## Installing and using Ed

To learn how to install and begin using Ed, please visit our
[documentation page](https://gohugo-theme-ed.netlify.app/documentation/?utm_source=github.com&utm_campaign=docs&utm_medium=smm).

## License

Ed licensed under the MIT License. See the [LICENSE](https://raw.githubusercontent.com/sergeyklay/gohugo-theme-ed/master/LICENSE) file for more information.
