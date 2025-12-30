import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthStore } from "@/stores/authStore";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { validateEmail, validatePassword } from "@/lib/validation";

interface LoginFormProps {
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function LoginForm({ onSuccess, onError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [formError, setFormError] = useState("");

  const { login } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debounce timers
  const emailDebounceRef = useRef<NodeJS.Timeout>();
  const passwordDebounceRef = useRef<NodeJS.Timeout>();

  const validateEmailField = useCallback(async (value: string) => {
    if (emailDebounceRef.current) {
      clearTimeout(emailDebounceRef.current);
    }

    if (!value) {
      setEmailError("");
      return;
    }

    emailDebounceRef.current = setTimeout(async () => {
      const result = await validateEmail(value);
      if (!result.isValid) {
        setEmailError(result.error || "Invalid email");
      } else {
        setEmailError("");
      }
    }, 300);
  }, []);

  const validatePasswordField = useCallback(async (value: string) => {
    if (passwordDebounceRef.current) {
      clearTimeout(passwordDebounceRef.current);
    }

    if (!value) {
      setPasswordError("");
      return;
    }

    passwordDebounceRef.current = setTimeout(async () => {
      const result = await validatePassword(value);
      if (!result.isValid) {
        setPasswordError(result.error || "Invalid password");
      } else {
        setPasswordError("");
      }
    }, 300);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    // Validate form using backend validation
    const emailResult = await validateEmail(email);
    const passwordResult = await validatePassword(password);

    if (!emailResult.isValid) {
      setEmailError(emailResult.error || "Invalid email");
    }
    if (!passwordResult.isValid) {
      setPasswordError(passwordResult.error || "Invalid password");
    }

    if (!emailResult.isValid || !passwordResult.isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password);
      onSuccess?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Login failed. Please try again.";
      setFormError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>
          Enter your email and password to access your account
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {formError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(""); // Clear error on change
                validateEmailField(e.target.value);
              }}
              onBlur={async () => {
                const result = await validateEmail(email);
                if (!result.isValid) {
                  setEmailError(result.error || "Invalid email");
                }
              }}
              disabled={isSubmitting}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            {emailError && (
              <p id="email-error" className="text-sm text-destructive">
                {emailError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordError(""); // Clear error on change
                validatePasswordField(e.target.value);
              }}
              onBlur={async () => {
                const result = await validatePassword(password);
                if (!result.isValid) {
                  setPasswordError(result.error || "Invalid password");
                }
              }}
              disabled={isSubmitting}
              aria-invalid={!!passwordError}
              aria-describedby={passwordError ? "password-error" : undefined}
            />
            {passwordError && (
              <p id="password-error" className="text-sm text-destructive">
                {passwordError}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign In"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
