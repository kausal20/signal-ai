import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getClientId } from '@/lib/clientId';

export interface OnboardingProfile {
  name: string;
  primary_role: string;
  primary_goal: string;
  interests: string[];
  weekly_time_budget: string;
  experience_level: string;
  persona?: string;
  onboarding_completed_at?: string;
}

async function saveProfileWithRetry(profile: OnboardingProfile, maxRetries = 3) {
  let lastError: Error | null = null;
  const delays = [1000, 2000, 4000];

  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data, error } = await supabase.functions.invoke('save-onboarding-profile', {
        body: {
          client_id: getClientId(),
          primary_role: profile.primary_role,
          primary_goal: profile.primary_goal,
          interests: profile.interests,
          weekly_time_budget: profile.weekly_time_budget,
          experience_level: profile.experience_level,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error('Server returned ok: false');
      return { success: true, profile: data.profile };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delays[i]));
      }
    }
  }

  return { success: false, error: lastError };
}

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState(false);
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkOnboardingStatus() {
      const completed = localStorage.getItem('signal:onboardingComplete') === 'true';
      setIsComplete(completed);

      if (completed) {
        const stored = localStorage.getItem('signal:onboardingProfile');
        if (stored) {
          try {
            setProfile(JSON.parse(stored));
          } catch {
            // Corrupted local storage, will refetch from DB
          }
        }
      }

      setLoading(false);
    }

    checkOnboardingStatus();
  }, []);

  const completeOnboarding = async (formData: OnboardingProfile) => {
    setLoading(true);

    const fullProfile = {
      ...formData,
      onboarding_completed_at: new Date().toISOString(),
    };

    localStorage.setItem('signal:userName', formData.name.trim());
    localStorage.setItem('signal:interests', JSON.stringify(formData.interests));
    localStorage.setItem('signal:topics', JSON.stringify(formData.interests));
    localStorage.setItem('signal:onboardingProfile', JSON.stringify(fullProfile));
    localStorage.setItem('signal:primary_role', formData.primary_role);
    localStorage.setItem('signal:primary_goal', formData.primary_goal);
    localStorage.setItem('signal:weekly_time_budget', formData.weekly_time_budget);
    localStorage.setItem('signal:experience_level', formData.experience_level);

    const result = await saveProfileWithRetry(formData);

    if (result.success && result.profile?.persona) {
      localStorage.setItem('signal:persona', result.profile.persona);
      fullProfile.persona = result.profile.persona;
    }

    localStorage.setItem('signal:onboardingComplete', 'true');
    setProfile(fullProfile);
    setIsComplete(true);
    setLoading(false);

    return result;
  };

  return {
    isComplete,
    profile,
    loading,
    completeOnboarding,
  };
}
