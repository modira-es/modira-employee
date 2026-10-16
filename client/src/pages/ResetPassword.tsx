import {
  useEffect,
  useState,
} from "react";
import { useLocation } from "wouter";

import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { PasswordStrengthIndicator } from "@/components/PasswordStrengthIndicator";

import { useAuth } from "@/contexts/AuthContext";

export default function ResetPassword() {
  const [, setLocation] = useLocation();

  const {
    updatePassword,
    signOut,
    isRecoverySession,
    loading: authLoading,
  } = useAuth();

  const [showPassword, setShowPassword] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] = useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [success, setSuccess] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [validToken, setValidToken] =
    useState(false);

  const [checkingToken, setCheckingToken] =
    useState(true);

  const [form, setForm] = useState({
    password: "",
    confirmPassword: "",
  });

  /**
   * ============================================================
   * COMPROBAR SESIÓN DE RECUPERACIÓN
   * ============================================================
   */
  useEffect(() => {
    const checkRecoverySession =
      async () => {
        try {
          /*
           * Supabase puede devolver errores del enlace
           * directamente en el hash.
           */
          const hashParams =
            new URLSearchParams(
              window.location.hash.replace(
                /^#/,
                ""
              )
            );

          const errorCode =
            hashParams.get(
              "error_code"
            );

          const hashError =
            hashParams.get("error");

          /*
           * Enlace inválido o expirado.
           */
          if (
            hashError ===
              "access_denied" ||
            errorCode === "otp_expired"
          ) {
            setValidToken(false);

            setError(
              "El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo."
            );

            setCheckingToken(false);
            return;
          }

          /*
           * Una sesión normal NO permite acceder
           * a esta pantalla.
           *
           * Debe existir una sesión creada mediante
           * el flujo PASSWORD_RECOVERY.
           */
          if (!isRecoverySession) {
            setValidToken(false);

            setError(
              "El enlace de recuperación es inválido o ha expirado. Por favor solicita uno nuevo."
            );

            setCheckingToken(false);
            return;
          }

          /*
           * Sesión de recuperación válida.
           */
          setValidToken(true);
          setError(null);
          setCheckingToken(false);
        } catch (error) {
          console.error(
            "[ResetPassword] Error checking recovery session:",
            error
          );

          setValidToken(false);

          setError(
            "Error al verificar el enlace de recuperación."
          );

          setCheckingToken(false);
        }
      };

    /*
     * Esperamos a que AuthContext termine de
     * inicializar Supabase.
     */
    if (!authLoading) {
      checkRecoverySession();
    }
  }, [
    isRecoverySession,
    authLoading,
  ]);

  /**
   * ============================================================
   * ACTUALIZAR CONTRASEÑA
   * ============================================================
   */
  const handleResetPassword = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setError(null);
    setSuccess(null);

    const password =
      form.password;

    /*
     * ----------------------------------------------------------
     * VALIDACIÓN DE CONTRASEÑA
     * ----------------------------------------------------------
     */

    if (password.length < 10) {
      setError(
        "La contraseña debe tener al menos 10 caracteres."
      );
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError(
        "La contraseña debe contener al menos una mayúscula."
      );
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError(
        "La contraseña debe contener al menos una minúscula."
      );
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError(
        "La contraseña debe contener al menos un número."
      );
      return;
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setError(
        "La contraseña debe contener al menos un carácter especial."
      );
      return;
    }

    if (
      password !==
      form.confirmPassword
    ) {
      setError(
        "Las contraseñas no coinciden."
      );
      return;
    }

    /*
     * No permitimos actualizar si el contexto
     * ya no considera válida la recuperación.
     */
    if (!isRecoverySession) {
      setError(
        "El enlace de recuperación ya no es válido. Solicita uno nuevo."
      );
      return;
    }

    setLoading(true);

    try {
      const result =
        await updatePassword(password);

      if (!result.success) {
        setError(
          result.error ||
            "Error al actualizar la contraseña."
        );
        return;
      }

      setSuccess(
        "¡Contraseña actualizada correctamente!"
      );

      /*
       * Cerramos la sesión de recuperación
       * después de actualizar la contraseña.
       */
      setTimeout(async () => {
        await signOut();

        setLocation("/login");
      }, 1500);
    } catch (error) {
      console.error(
        "[ResetPassword] Update password error:",
        error
      );

      setError(
        "Error al actualizar la contraseña."
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * ============================================================
   * LOADING
   * ============================================================
   */
  if (
    authLoading ||
    checkingToken
  ) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-2 border-gray-200 shadow-xl">
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#1E3A8A]" />

            <p className="mt-4 text-gray-600">
              Verificando enlace...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  /**
   * ============================================================
   * TOKEN INVÁLIDO
   * ============================================================
   */
  if (!validToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-2 border-gray-200 shadow-xl">
          <div className="p-8">

            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />

                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            </div>

            <Button
              onClick={() =>
                setLocation("/login")
              }
              className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-semibold py-2"
            >
              Volver al login
            </Button>

          </div>
        </Card>
      </div>
    );
  }

  /**
   * ============================================================
   * FORMULARIO
   * ============================================================
   */
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-gray-200 shadow-xl">
        <div className="p-8">

          {/* HEADER */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-[#1E3A8A] mb-2">
              Modira
            </h1>

            <p className="text-gray-600">
              Establece una nueva contraseña
            </p>
          </div>

          {/* ERROR */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />

                <p className="text-sm text-red-700">
                  {error}
                </p>
              </div>
            </div>
          )}

          {/* SUCCESS */}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded">
              <div className="flex gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />

                <p className="text-sm text-green-700">
                  {success}
                </p>
              </div>
            </div>
          )}

          <form
            onSubmit={
              handleResetPassword
            }
            className="space-y-4"
          >

            {/* NUEVA CONTRASEÑA */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nueva contraseña
              </label>

              <div className="relative">
                <Input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      password:
                        e.target.value,
                    })
                  }
                  required
                  autoComplete="new-password"
                  disabled={
                    loading ||
                    authLoading
                  }
                  className="w-full pr-10"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={
                    loading ||
                    authLoading
                  }
                  aria-label={
                    showPassword
                      ? "Ocultar contraseña"
                      : "Mostrar contraseña"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              <PasswordStrengthIndicator
                password={form.password}
              />
            </div>

            {/* CONFIRMAR CONTRASEÑA */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirmar contraseña
              </label>

              <div className="relative">
                <Input
                  type={
                    showConfirmPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="••••••••"
                  value={
                    form.confirmPassword
                  }
                  onChange={(e) =>
                    setForm({
                      ...form,
                      confirmPassword:
                        e.target.value,
                    })
                  }
                  required
                  autoComplete="new-password"
                  disabled={
                    loading ||
                    authLoading
                  }
                  className="w-full pr-10"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowConfirmPassword(
                      !showConfirmPassword
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  disabled={
                    loading ||
                    authLoading
                  }
                  aria-label={
                    showConfirmPassword
                      ? "Ocultar confirmación de contraseña"
                      : "Mostrar confirmación de contraseña"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* SUBMIT */}
            <Button
              type="submit"
              className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-semibold py-2"
              disabled={
                loading ||
                authLoading
              }
            >
              {loading ||
              authLoading
                ? "Actualizando contraseña..."
                : "Actualizar contraseña"}
            </Button>

            {/* VOLVER */}
            <p className="text-center text-sm text-gray-600 pt-4">
              <button
                type="button"
                onClick={() =>
                  setLocation("/login")
                }
                className="text-[#1E3A8A] hover:underline font-semibold"
                disabled={
                  loading ||
                  authLoading
                }
              >
                Volver al login
              </button>
            </p>

          </form>
        </div>
      </Card>
    </div>
  );
}