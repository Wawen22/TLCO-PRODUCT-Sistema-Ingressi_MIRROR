import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { GraphService } from "../services/graphService";
import { getAccessToken } from "../services/tokenService";
import "./UserProfile.css";

interface UserData {
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  officeLocation?: string;
  mobilePhone?: string;
}

function UserProfile() {
  const { instance, accounts } = useMsal();
  const [userProfile, setUserProfile] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (accounts.length > 0) {
      fetchUserProfile();
    }
  }, [accounts]);

  const fetchUserProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const account = accounts[0];
      const accessToken = await getAccessToken(instance, account);

      const graphService = new GraphService(accessToken);
      const profile = await graphService.getUserProfile();
      setUserProfile(profile);
      console.log("✅ Profilo utente caricato:", profile);
    } catch (error) {
      console.error("❌ Error fetching user profile:", error);
      setError("Errore nel caricamento del profilo utente");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="user-profile loading">
        <div className="spinner"></div>
        <p>Caricamento profilo...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="user-profile error">
        <p>❌ {error}</p>
        <button onClick={fetchUserProfile} className="retry-btn">
          Riprova
        </button>
      </div>
    );
  }

  return (
    <div className="user-profile">
      <h3>
        <span className="section-icon">👤</span>
        Profilo Utente Loggato
      </h3>
      {userProfile && (
        <div className="profile-info">
          <div className="profile-item">
            <span className="profile-label">Nome:</span>
            <span className="profile-value">{userProfile.displayName}</span>
          </div>
          <div className="profile-item">
            <span className="profile-label">Email:</span>
            <span className="profile-value">
              {userProfile.mail || userProfile.userPrincipalName}
            </span>
          </div>
          {userProfile.jobTitle && (
            <div className="profile-item">
              <span className="profile-label">Ruolo:</span>
              <span className="profile-value">{userProfile.jobTitle}</span>
            </div>
          )}
          {userProfile.officeLocation && (
            <div className="profile-item">
              <span className="profile-label">Ufficio:</span>
              <span className="profile-value">{userProfile.officeLocation}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default UserProfile;
