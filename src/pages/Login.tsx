import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { Eye, EyeOff, Lock, Mail, Building2 } from "lucide-react";
import React from "react";
import "./Login.css";

const loginSchema = yup.object({
  email: yup
    .string()
    .email("عنوان البريد الإلكتروني غير صحيح")
    .required("البريد الإلكتروني مطلوب"),
  password: yup.string().required("كلمة المرور مطلوبة"),
});

type LoginFormData = yup.InferType<typeof loginSchema>;

export function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError("");

    try {
      await signInWithEmailAndPassword(auth, data.email, data.password);
      navigate("/");
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === "auth/user-not-found") {
        setError("لم يتم العثور على حساب بهذا البريد الإلكتروني");
      } else if (error.code === "auth/wrong-password") {
        setError("كلمة المرور غير صحيحة");
      } else if (error.code === "auth/invalid-email") {
        setError("عنوان البريد الإلكتروني غير صحيح");
      } else if (error.code === "auth/too-many-requests") {
        setError("محاولات فاشلة كثيرة. يرجى المحاولة مرة أخرى لاحقاً");
      } else {
        setError("فشل في تسجيل الدخول. يرجى التحقق من بياناتك");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {/* Background decorative elements */}
      <div className="login-background">
        <div className="login-bg-circle-1"></div>
        <div className="login-bg-circle-2"></div>
        <div className="login-bg-circle-3"></div>
      </div>

      <div className="login-content">
        <div className="login-header">
          <h2 className="login-title">مرحباً بعودتك</h2>
        </div>

        <div className="login-form-container">
          <form className="login-form" onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="login-error">
                <p>{error}</p>
              </div>
            )}

            <div className="login-field">
              <label htmlFor="email" className="login-label">
                عنوان البريد الإلكتروني
              </label>
              <div className="login-input-wrapper">
                <Mail className="login-input-icon" />
                <input
                  {...register("email")}
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={`login-input ${errors.email ? "error" : ""}`}
                  placeholder="أدخل بريدك الإلكتروني"
                />
              </div>
              {errors.email && (
                <p className="login-error-text">{errors.email.message}</p>
              )}
            </div>

            <div className="login-field">
              <label htmlFor="password" className="login-label">
                كلمة المرور
              </label>
              <div className="login-input-wrapper">
                <Lock className="login-input-icon" />
                <input
                  {...register("password")}
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  className={`login-input ${errors.password ? "error" : ""}`}
                  placeholder="أدخل كلمة المرور"
                />
                <button
                  type="button"
                  className="login-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
              {errors.password && (
                <p className="login-error-text">{errors.password.message}</p>
              )}
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="login-button"
              >
                {isLoading ? (
                  <div className="login-button-loading">
                    <div className="login-spinner"></div>
                    جاري تسجيل الدخول...
                  </div>
                ) : (
                  <>
                    <span className="login-button-text">تسجيل الدخول</span>
                    <div className="login-button-hover-bg"></div>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="login-footer">
            <button
              type="button"
              className="forgot-password-link"
              onClick={() => navigate("/reset-password")}
            >
              هل نسيت كلمة السر ؟
            </button>
          </div>
        </div>
      </div>

      {/* Footer branding */}
    </div>
  );
}
