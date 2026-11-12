# Tài liệu API Voice Studio (`http://192.168.5.18:3900`)

Tài liệu này lưu cấu trúc phản hồi và tham số chuẩn đã xác nhận của Voice Studio nội bộ.

## 1. Danh sách Endpoint

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/v1/audio/voices` | Liệt kê danh sách giọng (`voices`) và danh sách `engines` TTS |
| `POST` | `/v1/audio/speech` | Tổng hợp giọng nói (TTS) trả về audio (`wav`, `mp3`, `opus`, `aac`, `flac`, `pcm`) |
| `POST` | `/v1/audio/transcriptions` | Chuyển giọng nói thành văn bản (STT) kèm mốc thời gian từng từ (`timestamp_granularities[]=word`) |
| `POST` | `/v1/audio/translations` | Dịch audio sang tiếng Anh |
| `GET` | `/v1/models` | Danh sách model TTS / STT |
| `GET` | `/v1/models/{model_id}` | Chi tiết model |

## 2. Mẫu phản hồi `GET /v1/audio/voices`

```json
{
  "voices": [
    {
      "id": "7cc37272",
      "voice_id": "7cc37272",
      "name": "giong_1_nam",
      "type": "profile",
      "language": "Auto",
      "addressable_by_name": true
    },
    {
      "id": "alloy",
      "voice_id": "alloy",
      "name": "alloy",
      "type": "openai_alias"
    }
  ],
  "engines": [
    {
      "id": "omnivoice",
      "available": true,
      "supports_emotion": false,
      "max_ref_seconds": 20
    },
    {
      "id": "omnivoice-subprocess",
      "available": true,
      "supports_emotion": false
    },
    {
      "id": "kittentts",
      "available": true
    },
    {
      "id": "voxcpm2",
      "available": false
    }
  ]
}
```

## 3. Quy tắc nhận diện giọng và Pool

- Các giọng có `type: "openai_alias"` (`alloy`, `ash`, `ballad`, `cedar`, `coral`, `echo`, `fable`, `marin`, `nova`, `onyx`, `sage`, `shimmer`, `verse`) đều ánh xạ về giọng mặc định, bị ẩn theo mặc định (có công tắc bật trong UI) và **không đưa vào Voice Pool tự động**.
- Quy ước hậu tố tên giọng:
  - `_nam`: Giọng nam (ví dụ: `giong_1_nam`, `tran_nam`)
  - `_nu`: Giọng nữ (ví dụ: `giong_2_nu`, `lan_nu`)
  - Regex nhận diện: `^(.+)_(nam|nu)$` (không phân biệt hoa thường).
- Thẻ biểu cảm hỗ trợ bởi `omnivoice`: `[laughter]`, `[sigh]`, `[surprise-ah]`, `[surprise-wa]`, `[question-en]`, `[dissatisfaction-hnn]`. Các thẻ này được lọc sạch khỏi phụ đề (Caption Agent).
