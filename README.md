# Multi-Platform Video Upload Application

This is the frontend UI for a multi-platform video upload application built using Next.js 15 with the App Router and shadcn/ui components. It allows users to connect their YouTube, Instagram/Meta, and TikTok accounts and upload a single short-form video along with additional details. The video can be published as YouTube Shorts, Instagram Reels, and TikTok videos.

## Key Features

- **Landing Page**: A visually engaging homepage with a clear call-to-action.
- **Authentication**: Login and registration pages for user account management.
- **Dashboard**:
  - View connected platform statuses.
  - See recent uploads and quick statistics.
- **Platform Connections**: UI to connect to YouTube, Instagram/Meta, and TikTok.
- **Video Upload**:
  - Upload a video file with preview and file details.
  - General description field.
  - Platform-specific settings via tabs (custom titles, descriptions, tags, etc.).
- **Settings**: Manage account information, platform connections, and notification preferences.

## Roadmap & Future Enhancements

- **Backend & Storage**: Implement logic for authentication, file storage, and database management.
- **API Integrations**:
  - Use the YouTube Data API to post YouTube Shorts.
  - Integrate with TikTok Content Posting API.
  - Connect with the Instagram API for posting Reels.
- **Logic & Error Handling**: Add proper upload error handling, processing notifications, and analytics.

## How to Get Started

1. Clone the repository.
2. Install dependencies using your preferred package manager.
3. Run the development server:

```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser.

## Next Steps

This repository currently contains only the frontend UI. Future commits will include backend functionality, storage integration, and API logic for processing multi-platform video uploads.

## Contact

For inquiries or support, please email [neilsmahajan@gmail.com](mailto:neilsmahajan@gmail.com).
