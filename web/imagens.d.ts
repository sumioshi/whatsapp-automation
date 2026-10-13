// Tipos dos imports estáticos de imagem (.webp, .png…). O next-env.d.ts, que já traz
// isto, só nasce no primeiro build; sem esta linha o tsc de um clone novo falha.
/// <reference types="next/image-types/global" />
