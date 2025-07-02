/**
 * Toast utility functions dengan konfigurasi preset
 */

import { toast } from "@/hooks/use-toast"

export const showToast = {
  /**
   * Success toast - auto dismiss dalam 3 detik
   */
  success: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "default",
      duration: 3000, // 3 detik
    })
  },

  /**
   * Error toast - auto dismiss dalam 6 detik (lebih lama untuk error)
   */
  error: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "destructive",
      duration: 6000, // 6 detik
    })
  },

  /**
   * Info toast - auto dismiss dalam 4 detik
   */
  info: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "default",
      duration: 4000, // 4 detik
    })
  },

  /**
   * Warning toast - auto dismiss dalam 5 detik
   */
  warning: (title: string, description?: string) => {
    return toast({
      title,
      description,
      variant: "destructive",
      duration: 5000, // 5 detik
    })
  },

  /**
   * Persistent toast - tidak auto dismiss (duration: 0)
   */
  persistent: (title: string, description?: string, variant?: "default" | "destructive") => {
    return toast({
      title,
      description,
      variant: variant || "default",
      duration: 0, // Tidak auto dismiss
    })
  },

  /**
   * Quick toast - auto dismiss dalam 2 detik untuk pesan singkat
   */
  quick: (title: string) => {
    return toast({
      title,
      variant: "default",
      duration: 2000, // 2 detik
    })
  }
}

// Example usage:
// showToast.success("Berhasil!", "Data telah disimpan")
// showToast.error("Error!", "Gagal menyimpan data")
// showToast.info("Info", "Sistem sedang maintenance")
// showToast.warning("Peringatan", "Koneksi tidak stabil")
// showToast.persistent("Penting", "Pesan ini tidak akan hilang otomatis")
// showToast.quick("Tersimpan!")
