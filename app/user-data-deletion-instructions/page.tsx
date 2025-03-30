"use client";
import React from "react";
// import { useRouter } from 'next/navigation';

export default function UserDataDeletionInstructions() {
  // const router = useRouter();

  // const handleDisconnect = () => {
  //   router.push('/api/auth/disconnect/instagram');
  // };

  return (
    <div className="container">
      <h1>User Data Deletion Instructions</h1>
      <p>
        To comply with Meta&#39;s data privacy requirements, you can delete your
        data by disconnecting your Instagram account.
      </p>
      <p>
        Clicking the button below will remove your Instagram access token and
        all associated data from our database.
      </p>
      {/* <button onClick={handleDisconnect} className="disconnect-button">
        Disconnect Instagram
      </button> */}
    </div>
  );
}
