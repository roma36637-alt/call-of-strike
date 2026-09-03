# CALL OF STRIKE — Android APK

Проект подготовлен для упаковки React/Vite игры в настоящее Android-приложение через Capacitor.

## Требования
- Node.js 20+
- Android Studio + Android SDK
- JDK 21 (для актуального Capacitor/Gradle toolchain)

## Сборка
```bash
npm install
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

В Android Studio выбери **Build → Build APK(s)**.

Для debug APK из терминала:
```bash
npm run apk:debug
```

APK появится примерно здесь:
`android/app/build/outputs/apk/debug/app-debug.apk`

## Идентификатор
`com.callofstrike.tdm`

## Управление
В игре уже есть сенсорные джойстики и кнопки RELOAD / SWAP / STRIKE / FRAG. Игра при запуске на touch-устройстве пытается перейти в fullscreen и landscape.
