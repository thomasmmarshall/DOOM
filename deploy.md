build and deploy using these commands

1. npm run build
2. npm exec --yes --package=node@20 --package=wrangler@latest -- sh -c 'wrangler pages deploy dist --project-name doom-threejs --branch master'
