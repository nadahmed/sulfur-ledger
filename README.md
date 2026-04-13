This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

**Built with pride using the Google Antigravity coding IDE and Antigravity agents.**

## Getting Started

First, run the development server:

```bash
netlify dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deployment on Netlify

This project is optimized for deployment on [Netlify](https://www.netlify.com/).

### 1. Configure Environment Variables
Ensure all environment variables from `.env.local` are added in the Netlify UI (Site settings > Build & deploy > Environment).

### 2. Local Development
For the best local development experience, especially for serverless functions, use the Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

### 3. Deploy
The easiest way to deploy is to connect your repository to Netlify for automatic deployments on every push. 
Alternatively, use the CLI:

```bash
netlify deploy --build
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
