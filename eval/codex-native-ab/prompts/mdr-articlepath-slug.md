articlePath('blog', ['Hello','World']) in src/x.js returns '/bloghello-world' - the slash between the section and the slug is missing. Fix articlePath so it returns '/blog/hello-world'.
