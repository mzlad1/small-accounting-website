import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../config/firebase";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";
import React from "react";
import "./ResetPassword.css";

const resetPasswordSchema = yup.object({
  email: yup
    .string()
    .email("عنوان البريد الإلكتروني غير صحيح")
    .required("البريد الإلكتروني مطلوب"),
});

type ResetPasswordFormData = yup.InferType<typeof resetPasswordSchema>;

export function ResetPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: yupResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    setError("");
    setSuccess(false);

    try {
      await sendPasswordResetEmail(auth, data.email);
      setSuccess(true);
    } catch (error: any) {
      console.error("Password reset error:", error);
      if (error.code === "auth/user-not-found") {
        setError("لم يتم العثور على حساب بهذا البريد الإلكتروني");
      } else if (error.code === "auth/invalid-email") {
        setError("عنوان البريد الإلكتروني غير صحيح");
      } else if (error.code === "auth/too-many-requests") {
        setError("محاولات كثيرة جداً. يرجى المحاولة مرة أخرى لاحقاً");
      } else {
        setError("فشل في إرسال رابط إعادة تعيين كلمة المرور");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="reset-password-container">
      {/* Background decorative elements */}
      <div className="reset-password-background">
        <div className="reset-password-bg-circle-1"></div>
        <div className="reset-password-bg-circle-2"></div>
        <div className="reset-password-bg-circle-3"></div>
      </div>

      <div className="reset-password-content">
        <button
          className="back-to-login-btn"
          onClick={() => navigate("/login")}
        >
          <ArrowLeft className="back-icon" />
          <span>العودة لتسجيل الدخول</span>
        </button>

        <div className="reset-password-header">
          <h2 className="reset-password-title">إعادة تعيين كلمة المرور</h2>
          <p className="reset-password-subtitle">
            أدخل بريدك الإلكتروني وسنرسل لك رابط لإعادة تعيين كلمة المرور
          </p>
        </div>

        <div className="reset-password-form-container">
          {success ? (
            <div className="success-message-container">
              <CheckCircle className="success-icon" />
              <h3 className="success-title">تم إرسال الرابط بنجاح!</h3>
              <p className="success-text">
                تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني. يرجى
                التحقق من صندوق الوارد الخاص بك.
              </p>
              <button
                className="success-back-btn"
                onClick={() => navigate("/login")}
              >
                العودة لتسجيل الدخول
              </button>
            </div>
          ) : (
            <form
              className="reset-password-form"
              onSubmit={handleSubmit(onSubmit)}
            >
              {error && (
                <div className="reset-password-error">
                  <p>{error}</p>
                </div>
              )}

              <div className="reset-password-field">
                <label htmlFor="email" className="reset-password-label">
                  عنوان البريد الإلكتروني
                </label>
                <div className="reset-password-input-wrapper">
                  <Mail className="reset-password-input-icon" />
                  <input
                    {...register("email")}
                    id="email"
                    type="email"
                    autoComplete="email"
                    className={`reset-password-input ${
                      errors.email ? "error" : ""
                    }`}
                    placeholder="أدخل بريدك الإلكتروني"
                  />
                </div>
                {errors.email && (
                  <p className="reset-password-error-text">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="reset-password-button"
                >
                  {isLoading ? (
                    <div className="reset-password-button-loading">
                      <div className="reset-password-spinner"></div>
                      جاري الإرسال...
                    </div>
                  ) : (
                    <>
                      <span className="reset-password-button-text">
                        إرسال رابط إعادة التعيين
                      </span>
                      <div className="reset-password-button-hover-bg"></div>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
