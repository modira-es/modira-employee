import { useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

type AuthMode = "login" | "forgot-password";

export default function EmployeeAuth() {
  const [, setLocation] = useLocation();

  const {
    signIn,
    resetPassword,
    loading: authLoading,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>("login");

  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [success, setSuccess] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const loginCaptchaRef = useRef<TurnstileInstance | null>(null);

  const forgotCaptchaRef = useRef<TurnstileInstance | null>(null);

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  const [forgotForm, setForgotForm] = useState({
    email: "",
  });

  /**
   * ============================================================
   * LOGIN
   * ============================================================
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setSuccess(null);

    /*
     * El CAPTCHA es obligatorio antes de iniciar sesión.
     */
    if (!captchaToken) {
      setError(
        "Completa la verificación de seguridad antes de iniciar sesión."
      );
      return;
    }

    setLoading(true);

    try {
      const email = loginForm.email.trim();

      const result = await signIn(
        email,
        loginForm.password,
        captchaToken
      );

      if (!result.success) {
        setError(
          result.error || "Error al iniciar sesión."
        );
        return;
      }

      /*
       * Obtener el usuario autenticado después
       * del login.
       */
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        await supabase.auth.signOut();

        setError(
          "No se pudo verificar la sesión."
        );

        return;
      }

      /*
       * Comprobar que el usuario pertenece a workers
       * y que el trabajador está activo.
       *
       * Esta comprobación NO sustituye a RLS/RPC.
       * Es una primera barrera de acceso a la interfaz.
       */
      const {
        data: workerData,
        error: workerError,
      } = await supabase
        .from("workers")
        .select("is_active")
        .eq("auth_user_id", user.id)
        .single();

      if (
        workerError ||
        !workerData ||
        workerData.is_active !== true
      ) {
        await supabase.auth.signOut();

        setError(
          "No tienes autorización para acceder al área de empleados."
        );

        return;
      }

      /*
       * Acceso concedido.
       */
      setLocation("/");
    } catch (error) {
      console.error(
        "[EmployeeAuth] Login error:",
        error
      );

      setError(
        "Error al iniciar sesión."
      );
    } finally {
      setLoading(false);

      /*
       * Los tokens de Turnstile son de un solo uso.
       * Después de cada intento generamos uno nuevo.
       */
      setCaptchaToken(null);
      loginCaptchaRef.current?.reset();
    }
  };

  /**
   * ============================================================
   * RECUPERACIÓN DE CONTRASEÑA
   * ============================================================
   */
  const handleForgotPassword = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    setError(null);
    setSuccess(null);

    /*
     * El CAPTCHA es obligatorio antes de solicitar
     * la recuperación de contraseña.
     */
    if (!captchaToken) {
      setError(
        "Completa la verificación de seguridad antes de solicitar la recuperación."
      );
      return;
    }

    setLoading(true);

    try {
      const email = forgotForm.email.trim();

      /*
       * No consultamos profiles ni workers.
       *
       * Esto evita:
       * - dependencia innecesaria de RLS;
       * - consultas adicionales;
       * - enumeración de cuentas.
       *
       * Supabase Auth gestiona el envío.
       */
      const result = await resetPassword(
        email,
        captchaToken
      );

      /*
       * Mantenemos un mensaje genérico para no
       * revelar si una dirección existe o no.
       */
      if (!result.success) {
        setSuccess(
          "Si el correo electrónico corresponde a una cuenta, recibirás un enlace de recuperación."
        );

        return;
      }

      setSuccess(
        "Si el correo electrónico corresponde a una cuenta, recibirás un enlace de recuperación."
      );

      setForgotForm({
        email: "",
      });
    } catch (error) {
      console.error(
        "[EmployeeAuth] Password recovery error:",
        error
      );

      /*
       * Mensaje genérico también ante errores.
       */
      setSuccess(
        "Si el correo electrónico corresponde a una cuenta, recibirás un enlace de recuperación."
      );
    } finally {
      setLoading(false);

      /*
       * El token se invalida después del intento.
       */
      setCaptchaToken(null);
      forgotCaptchaRef.current?.reset();
    }
  };

  /**
   * ============================================================
   * CAMBIAR DE MODO
   * ============================================================
   */
  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
    setCaptchaToken(null);

    loginCaptchaRef.current?.reset();
    forgotCaptchaRef.current?.reset();
  };

  const isBusy = loading || authLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-[#F5F7FA] to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-gray-200 shadow-xl">
        <div className="p-8">

          {/* HEADER */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-[#1E3A8A] mb-2">
              Modira
            </h1>

            <h2 className="text-xl font-semibold text-gray-800 mb-1">
              Área de Empleados
            </h2>

            <p className="text-gray-600">
              {mode === "login"
                ? "Inicia sesión con tus credenciales internas"
                : "Recupera tu acceso de trabajador"}
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

          {/* ====================================================
              LOGIN
              ==================================================== */}
          {mode === "login" && (
            <form
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Correo electrónico
                </label>

                <Input
                  type="email"
                  placeholder="empleado@modira.es"
                  value={loginForm.email}
                  onChange={(e) =>
                    setLoginForm({
                      ...loginForm,
                      email: e.target.value,
                    })
                  }
                  required
                  autoComplete="username"
                  disabled={isBusy}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contraseña
                </label>

                <div className="relative">
                  <Input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) =>
                      setLoginForm({
                        ...loginForm,
                        password: e.target.value,
                      })
                    }
                    required
                    autoComplete="current-password"
                    disabled={isBusy}
                    className="w-full pr-10"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(!showPassword)
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    disabled={isBusy}
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
              </div>

              {/* CAPTCHA */}
              <div className="flex justify-center pt-2">
                <Turnstile
                  ref={loginCaptchaRef}
                  siteKey={
                    import.meta.env
                      .VITE_TURNSTILE_SITE_KEY
                  }
                  onSuccess={(token) => {
                    setCaptchaToken(token);
                    setError(null);
                  }}
                  onExpire={() => {
                    setCaptchaToken(null);
                  }}
                  onError={() => {
                    setCaptchaToken(null);

                    setError(
                      "No se ha podido verificar el CAPTCHA. Inténtalo de nuevo."
                    );
                  }}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-semibold py-2"
                disabled={isBusy}
              >
                {isBusy
                  ? "Verificando..."
                  : "Iniciar sesión"}
              </Button>

              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={() =>
                    switchMode("forgot-password")
                  }
                  className="text-sm text-[#1E3A8A] hover:underline"
                  disabled={isBusy}
                >
                  ¿Has olvidado tu contraseña?
                </button>
              </div>
            </form>
          )}

          {/* ====================================================
              RECUPERACIÓN
              ==================================================== */}
          {mode === "forgot-password" && (
            <form
              onSubmit={handleForgotPassword}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Correo electrónico
                </label>

                <Input
                  type="email"
                  placeholder="empleado@modira.es"
                  value={forgotForm.email}
                  onChange={(e) =>
                    setForgotForm({
                      email: e.target.value,
                    })
                  }
                  required
                  autoComplete="email"
                  disabled={isBusy}
                  className="w-full"
                />
              </div>

              {/* CAPTCHA */}
              <div className="flex justify-center pt-2">
                <Turnstile
                  ref={forgotCaptchaRef}
                  siteKey={
                    import.meta.env
                      .VITE_TURNSTILE_SITE_KEY
                  }
                  onSuccess={(token) => {
                    setCaptchaToken(token);
                    setError(null);
                  }}
                  onExpire={() => {
                    setCaptchaToken(null);
                  }}
                  onError={() => {
                    setCaptchaToken(null);

                    setError(
                      "No se ha podido verificar el CAPTCHA. Inténtalo de nuevo."
                    );
                  }}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#1E3A8A] hover:bg-[#1E3A8A]/90 text-white font-semibold py-2"
                disabled={isBusy}
              >
                {isBusy
                  ? "Procesando..."
                  : "Solicitar recuperación"}
              </Button>

              <div className="text-center pt-4">
                <button
                  type="button"
                  onClick={() =>
                    switchMode("login")
                  }
                  className="text-sm text-[#1E3A8A] hover:underline"
                  disabled={isBusy}
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </form>
          )}

        </div>
      </Card>
    </div>
  );
}