# Competency Questions (CQ) Review Tool

A lightweight, static web application designed for reviewing, annotating, and rating structured competency questions (CQs) for any domain or ontology.

## Features

- **Ontology Modules Organization:** Group competency questions into ontology modules (e.g., Nutritional Intervention). Normal users can browse and select modules to review; administrators can add, rename, or delete modules.
- **Review Competency Questions:** Display a list of CQs along with their exemplar answers for the selected module.
- **Rating System:** Annotate questions using a 5-point Likert scale to vote on their relevance or accuracy.
- **Comments & Discussions:** Add comments to specific questions to discuss wording, scope, or domain requirements.
- **Tag Filtering & Sorting:** Easily sort by ID or average rating, and filter by tags or review status to track progress.
- **Version Control:** Create and switch between versions of the competency questions dataset for each module.
- **Admin Tools:** Add, edit, and delete modules; duplicate, edit, reorder, and delete questions; and export module backups directly from the interface.

## Architecture

This tool uses a static frontend (`index.html`, vanilla JS, and CSS) alongside Netlify serverless functions for the backend. Data is persistently stored using [Netlify Blobs](https://docs.netlify.com/blobs/overview/), meaning there are no external databases or services to configure.

## Deployment on Netlify

You can easily deploy your own instance of this tool for your domain for free using Netlify.

### 1. Fork this Repository
Click the **Fork** button at the top right of this repository to create your own copy on your GitHub account.

### 2. Deploy to Netlify
1. Log in to [Netlify](https://app.netlify.com/) and click **Add new site** > **Import an existing project**.
2. Select GitHub and authorize access if necessary.
3. Choose your forked repository.
4. Netlify will automatically detect the build settings from the `netlify.toml` file.
   - **Base directory:** (leave empty)
   - **Build command:** `node inject-title.js && npm install && cd netlify/functions && npm install`
   - **Publish directory:** `.`

### 3. Set Environment Variables
Before deploying, you can customize the tool via environment variables.

1. Go to **Site Configuration** > **Environment variables**.
2. Add the following variables:
   - **`Title`**: Your Custom Title (e.g., *Biomedical Ontology Review*)
   - **`AdminPassword`**: The password required to log in as the admin user.
3. Click **Deploy site**.

Once the deployment is complete, your CQ review tool will be live!

## Usage

- **Default Access:** When you visit the site, enter any name to "log in" for the session. Your name will be attached to your ratings and comments. After entering your name, you will see the list of ontology modules (e.g. Nutritional Intervention). Select a module to enter its competency questions workspace. You can return to the modules screen at any time using the "Back to Modules" button.
- **Admin Access:** Enter your name as `admin`. A second field will appear asking for the admin password you set in the Netlify environment variables. Upon successful verification, you'll gain access to add, edit, and delete modules, as well as edit, duplicate, reorder, and delete competency questions, create new dataset versions, and download backups.

## Modifying the Code

- **Frontend:** You can modify styles in `cq_review.css` and behavior in `cq_review.js`.
- **Title Configuration:** The title is dynamically injected at build time. If you want to manually change the title, simply edit `index.html` or update the `Title` environment variable in Netlify and trigger a rebuild.

## License

This project is licensed under the [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/) License.
